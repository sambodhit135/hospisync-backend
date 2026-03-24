package hospital.Hospisync_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
@SpringBootApplication
@EnableScheduling
public class HospisyncBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(HospisyncBackendApplication.class, args);
	}

}
